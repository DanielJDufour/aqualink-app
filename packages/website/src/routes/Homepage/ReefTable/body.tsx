import { TableBody, TableCell, TableRow, Typography } from "@material-ui/core";
import ErrorIcon from "@material-ui/icons/Error";
import React, { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { TableRow as Row } from "../../../store/Homepage/types";
import { constructTableData } from "../../../store/Reefs/helpers";
import { colors } from "../../../layout/App/theme";
import { dhwColorFinder } from "../../../helpers/degreeHeatingWeeks";
import { alertColorFinder } from "../../../helpers/bleachingAlertIntervals";
import { formatNumber } from "../../../helpers/numberUtils";
import { reefsListSelector } from "../../../store/Reefs/reefsListSlice";
import { setReefOnMap } from "../../../store/Homepage/homepageSlice";
import { getComparator, Order, OrderKeys, stableSort } from "./utils";

type ReefTableBodyProps = {
  order: Order;
  orderBy: OrderKeys;
};

const ReefTableBody = ({ order, orderBy }: ReefTableBodyProps) => {
  const dispatch = useDispatch();
  const reefsList = useSelector(reefsListSelector);
  const [selectedRow, setSelectedRow] = useState<number>();

  const handleClick = (event: unknown, reef: Row) => {
    setSelectedRow(reef.tableData.id);
    dispatch(setReefOnMap(reefsList[reef.tableData.id]));
  };

  return (
    <TableBody>
      {stableSort<Row>(
        constructTableData(reefsList),
        getComparator(order, orderBy)
      ).map((reef) => {
        return (
          <TableRow
            hover
            style={{
              backgroundColor:
                reef.tableData.id === selectedRow
                  ? colors.lighterBlue
                  : "white",
              cursor: "pointer",
            }}
            onClick={(event) => handleClick(event, reef)}
            role="button"
            tabIndex={-1}
            key={reef.tableData.id}
          >
            <TableCell>
              <Typography
                align="left"
                variant="subtitle1"
                color="textSecondary"
              >
                {reef.locationName}
              </Typography>
            </TableCell>
            <TableCell align="center">
              <Typography
                style={{ color: colors.lightBlue }}
                variant="subtitle1"
              >
                {formatNumber(reef.temp, 1)}
              </Typography>
            </TableCell>
            <TableCell align="center">
              <Typography variant="subtitle1" color="textSecondary">
                {reef.depth}
              </Typography>
            </TableCell>
            <TableCell align="center">
              <Typography
                style={{
                  color: reef.dhw ? `${dhwColorFinder(reef.dhw)}` : "black",
                }}
                variant="subtitle1"
              >
                {formatNumber(reef.dhw, 1)}
              </Typography>
            </TableCell>
            <TableCell align="center">
              <ErrorIcon
                style={{
                  color: alertColorFinder(reef.dhw),
                }}
              />
            </TableCell>
          </TableRow>
        );
      })}
    </TableBody>
  );
};

export default ReefTableBody;